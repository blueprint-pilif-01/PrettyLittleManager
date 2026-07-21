import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.API_PORT ?? 3000);
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: webOrigin.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle("PrettyLittleManager API")
    .setDescription("Private product, inventory, GS1, website, and marketplace operations API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .addCookieAuth("plm_refresh")
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("api/docs", app, openApiDocument, {
    swaggerOptions: { persistAuthorization: false },
  });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
