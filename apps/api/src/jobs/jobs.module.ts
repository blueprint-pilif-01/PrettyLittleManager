import { Module } from "@nestjs/common";
import { BackgroundJobsController, NotificationsController } from "./background-jobs.controller";
import { BackgroundJobsService } from "./background-jobs.service";

@Module({
  controllers: [BackgroundJobsController, NotificationsController],
  providers: [BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class JobsModule {}
