import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly dataSource: DataSource,
    @Inject('NATS_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const totalAmount = createOrderDto.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      // 1. Crear la orden
      const order = queryRunner.manager.create(Order, {
        customerId: createOrderDto.customerId,
        totalAmount,
        status: OrderStatus.PENDING,
      });

      const savedOrder = await queryRunner.manager.save(order);

      // 2. Crear los ítems asociados usando la entidad
      const itemsToSave = createOrderDto.items.map((item) =>
        queryRunner.manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        }),
      );

      await queryRunner.manager.save(OrderItem, itemsToSave);

      await queryRunner.commitTransaction();

      // 3. Emitir evento a NATS
      this.natsClient.emit('order.created', {
        id: savedOrder.id,
        customerId: savedOrder.customerId,
        totalAmount: savedOrder.totalAmount,
        status: savedOrder.status,
      });

      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const previousStatus = order.status;
    order.status = status;
    const updatedOrder = await this.orderRepository.save(order);

    if (status === OrderStatus.PAID && previousStatus !== OrderStatus.PAID) {
      this.natsClient.emit('order.paid', {
        id: updatedOrder.id,
        customerId: updatedOrder.customerId,
        status: updatedOrder.status,
      });
    }

    return updatedOrder;
  }
}