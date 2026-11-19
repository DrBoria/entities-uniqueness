import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";

// class-validator DTO for the same product shape as the Keystone
// ProductListing. Two recognized frameworks describing one entity.
export class ProductDto {
	@IsString()
	sku!: string;

	@IsString()
	title!: string;

	@IsInt()
	priceCents!: number;

	@IsBoolean()
	inStock!: boolean;

	@IsOptional()
	@IsString()
	description?: string;

	@IsString()
	createdAt!: string;
}
