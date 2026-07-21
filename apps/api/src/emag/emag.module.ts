import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module";
import { JobsModule } from "../jobs/jobs.module";
import { EmagController } from "./emag.controller";
import { EmagService } from "./emag.service";

@Module({ imports: [ChannelsModule, JobsModule], controllers: [EmagController], providers: [EmagService] })
export class EmagModule {}
