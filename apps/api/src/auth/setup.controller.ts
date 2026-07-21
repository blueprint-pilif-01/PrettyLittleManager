import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { bootstrapWorkspaceSchema, type BootstrapWorkspaceInput } from "@plm/contracts";
import { Public } from "../common/public.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SetupService } from "./setup.service";

@ApiTags("First-run setup")
@Public()
@Controller("setup")
export class SetupController {
  constructor(private readonly setup: SetupService) {}
  @Get("status") status() { return this.setup.status(); }
  @Post("bootstrap")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiHeader({ name: "X-Setup-Token", required: true })
  bootstrap(@Headers("x-setup-token") token: string | undefined, @Body(new ZodValidationPipe(bootstrapWorkspaceSchema)) input: BootstrapWorkspaceInput) { return this.setup.bootstrap(input, token); }
}
