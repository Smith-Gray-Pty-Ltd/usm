import { Controller, Get, Post, Put, Delete, Param, Body } from "@nestjs/common";

@Controller("api/users")
export class UsersController {
  @Get()
  findAll() {
    return { users: [] };
  }

  @Post()
  create(@Body() body: any) {
    return { id: 1, ...body };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return { id };
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return { id, ...body };
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return { deleted: id };
  }
}