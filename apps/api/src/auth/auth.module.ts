import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SetupController } from "./setup.controller";
import { SetupService } from "./setup.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("SESSION_SECRET");
        if (!secret || secret.length < 32) {
          throw new Error("SESSION_SECRET must contain at least 32 characters");
        }
        return { secret, signOptions: { issuer: "pretty-little-manager" } };
      },
    }),
  ],
  controllers: [AuthController, SetupController],
  providers: [AuthService, SetupService],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
