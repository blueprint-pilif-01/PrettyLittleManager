import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentAuth } from "../common/current-auth.decorator";
import { Public } from "../common/public.decorator";
import type { RequestAuth, RequestMetadata } from "../common/request-context";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

const REFRESH_COOKIE = "plm_refresh";

function requestMetadata(request: Request): RequestMetadata {
  return {
    correlationId: request.correlationId,
    ipAddress: request.ip,
    userAgent: request.header("user-agent"),
  };
}

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Sign in to an invitation-only workspace" })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(input, requestMetadata(request));
    this.setRefreshCookie(response, result.refreshToken);
    const { refreshToken: _secret, ...safeResult } = result;
    return safeResult;
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Rotate the refresh session and issue an access token" })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(
      request.cookies?.[REFRESH_COOKIE] as string | undefined,
      requestMetadata(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    const { refreshToken: _secret, ...safeResult } = result;
    return safeResult;
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async logout(
    @CurrentAuth() auth: RequestAuth,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(auth.sessionId, requestMetadata(request));
    response.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
  }

  @Get("me")
  @ApiBearerAuth()
  getMe(@CurrentAuth() auth: RequestAuth) {
    return auth;
  }

  private setRefreshCookie(response: Response, token: string) {
    const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: days * 86_400_000,
    });
  }
}
