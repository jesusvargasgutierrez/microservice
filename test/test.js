const { connect, StringCodec } = require('nats');

async function main() {
  try {
    const nc = await connect({ servers: 'nats://localhost:4222' });
    const sc = StringCodec();

    const payload = JSON.stringify({
      customerId: 'Jhon',
      items: [
        { productId: 'product', quantity: 3, price: 100.00 }
      ]
    });
    
    nc.publish('create_order', sc.encode(payload));

    await nc.flush();
    console.log('Registro creado!');

    await nc.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();