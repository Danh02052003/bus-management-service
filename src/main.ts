import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HttpExceptionFilter } from './utils/http-exception.filter';

async function bootstrap() {
  const PORT = 4002;
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        host: '127.0.0.1',
        port: PORT,
      },
    },
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen();
  console.log(`✅ Bus Management Service is listening on port ${PORT}`);
}
bootstrap();
