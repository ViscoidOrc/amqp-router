import {
  AMQPRecoverableClient,
  AMQPRecoverableChannel,
  AMQPRecoveryManager,
  declare,
} from '.';


const client = new AMQPRecoverableClient<AMQPRecoverableChannel>(
  AMQPRecoverableChannel,
  'amqp://localhost'
);

const rabbit: AMQPRecoveryManager = new AMQPRecoveryManager(client);

rabbit.on('client.connected', (client) => {
  console.log('[AMQP] Connected');
});

rabbit.on('client.ready', () => {
  console.log('[AMQP] Client ready for transactions');
});

rabbit.config(declare.exchange({ name: 'nexus_incoming', type: 'topic' }));

async function main() {
  await rabbit.connect();
}

main();
