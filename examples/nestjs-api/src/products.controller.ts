import { Controller, Get, Post } from "@nestjs/common";

@Controller("api/products")
export class ProductsController {
  @Get()
  findAll() {
    return { products: [] };
  }

  @Post()
  create() {
    return { id: 1 };
  }
}