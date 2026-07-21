import { Controller, Get } from "@nestjs/common";
import { getEmagReadiness, readEmagConfig } from "@plm/emag";
import { RequirePermissions } from "./access/permissions.decorator";

@Controller("integrations")
export class IntegrationController {
  @Get("emag/readiness")
  @RequirePermissions("integration.read")
  getEmagReadiness() {
    const readiness = getEmagReadiness(readEmagConfig());

    return {
      provider: "emag",
      ...readiness,
      credentialsLocation: "server-only",
      nextSteps: readiness.credentialsConfigured
        ? ["Test account connection", "Synchronize marketplace capabilities"]
        : [
            "Request eMAG Marketplace API access",
            "Add credentials to the server environment",
            "Keep EMAG_MODE=mock until connection validation succeeds",
          ],
    };
  }
}
