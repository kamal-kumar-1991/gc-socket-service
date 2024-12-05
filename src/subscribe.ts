// File: consumeMessage.ts

import dotenv from 'dotenv';
import amqp from 'amqplib';
dotenv.config();
const EXCHANGE_NAME = 'Bot_joining';
const QUEUE_NAME = 'Bot_joining';
const ROUTING_KEY = 'Bot_joining';
const AMQP_URL = process.env.RABBITMQ_URL!; 

async function consumeMessages() {
    try {
        // Step 1: Connect to RabbitMQ server
        const connection = await amqp.connect(AMQP_URL);
        const channel = await connection.createChannel();

        // Step 2: Declare exchange
        await channel.assertExchange(EXCHANGE_NAME, 'direct', {
            durable: true, // Ensures exchange survives broker restart
        });

        // Step 3: Declare queue
        await channel.assertQueue(QUEUE_NAME, {
            durable: true, // Ensures queue survives broker restart
        });

        // Step 4: Bind queue to exchange
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);
        channel.prefetch(1);
        console.log(`Waiting for messages in queue: ${QUEUE_NAME}`);

        // Step 5: Consume messages
        await channel.consume(
            QUEUE_NAME,
            (message) => {
                if (message) {
                    const content = message.content.toString();
                    try{
                        let messageContent = JSON.parse(content);
                    
                    
                        console.log(`Received message: ${messageContent}`);
                    }catch(error){

                    }
                   
                    
                    // Acknowledge the message
                    channel.ack(message);
                }
            },
            { noAck: false } // Ensures manual acknowledgment
        );
    } catch (error) {
        console.error(`Error consuming messages: ${error}`);
    }
}

// Start the consumer
consumeMessages();
