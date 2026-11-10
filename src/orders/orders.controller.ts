import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @EventPattern('create_order')
  create(@Payload() createOrderDto: CreateOrderDto) {
    console.log('🎯 ¡Orden recibida en el microservicio!', createOrderDto);
    return this.ordersService.create(createOrderDto);
  }
}