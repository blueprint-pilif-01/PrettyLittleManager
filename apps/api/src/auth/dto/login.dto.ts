import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@example.com" })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: "password", minLength: 12 })
  @IsString()
  @Length(12, 256)
  password!: string;

  @ApiProperty({ required: false, default: "aline" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  workspace?: string;
}
