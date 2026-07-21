import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  NotFoundException,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import {
  imageTargetSchema,
  reorderImageAssignmentsSchema,
  updateImageAssignmentSchema,
  type ImageTargetInput,
  type ReorderImageAssignmentsInput,
  type UpdateImageAssignmentInput,
} from "@plm/contracts";
import { RequirePermissions } from "../access/permissions.decorator";
import { CurrentAuth } from "../common/current-auth.decorator";
import { Public } from "../common/public.decorator";
import type { RequestAuth } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ImagesService } from "./images.service";
import { ObjectStorageService } from "./object-storage.service";

@ApiTags("Product images")
@ApiBearerAuth()
@Controller()
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post("images/upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FilesInterceptor("files", 10, { limits: { fileSize: 20 * 1024 * 1024 } }))
  @RequirePermissions("product.update")
  upload(
    @CurrentAuth() auth: RequestAuth,
    @UploadedFiles() files: Express.Multer.File[],
    @Body(new ZodValidationPipe(imageTargetSchema)) target: ImageTargetInput,
  ) {
    return this.images.upload(auth, files ?? [], target);
  }

  @Post("images/:id/assign")
  @RequirePermissions("product.update")
  assign(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(imageTargetSchema)) target: ImageTargetInput,
  ) {
    return this.images.assign(auth, id, target);
  }

  @Get("products/:id/images")
  @RequirePermissions("product.read")
  productImages(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.images.productImages(auth, id);
  }

  @Get("variants/:id/images")
  @RequirePermissions("product.read")
  variantImages(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.images.variantImages(auth, id);
  }

  @Patch("image-assignments/:id")
  @RequirePermissions("product.update")
  updateAssignment(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateImageAssignmentSchema)) input: UpdateImageAssignmentInput,
  ) {
    return this.images.updateAssignment(auth, id, input);
  }

  @Put("products/:id/images/order")
  @RequirePermissions("product.update")
  reorderProduct(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderImageAssignmentsSchema)) input: ReorderImageAssignmentsInput,
  ) {
    return this.images.reorder(auth, { productId: id }, input);
  }

  @Put("variants/:id/images/order")
  @RequirePermissions("product.update")
  reorderVariant(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reorderImageAssignmentsSchema)) input: ReorderImageAssignmentsInput,
  ) {
    return this.images.reorder(auth, { variantId: id }, input);
  }

  @Delete("images/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("product.update")
  remove(
    @CurrentAuth() auth: RequestAuth,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.images.remove(auth, id);
  }
}

@Controller()
export class PublicMediaController {
  constructor(private readonly storage: ObjectStorageService) {}

  @Public()
  @Get("media/*path")
  async media(@Param("path") path: string | string[]) {
    const key = Array.isArray(path) ? path.join("/") : path;
    if (key.startsWith("private/")) {
      throw new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "Media object not found" });
    }
    const body = await this.storage.read(key);
    return new StreamableFile(body, {
      type: this.contentType(key),
      disposition: "inline",
    });
  }

  private contentType(key: string) {
    if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
    if (key.endsWith(".png")) return "image/png";
    if (key.endsWith(".avif")) return "image/avif";
    return "image/webp";
  }
}
