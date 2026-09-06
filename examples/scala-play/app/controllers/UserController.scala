package controllers

import play.api.mvc._
import play.api.libs.json._

import javax.inject._

@Singleton
class UserController @Inject()(val controllerComponents: ControllerComponents) extends BaseController {

  def list: Action[AnyContent] = Action { implicit request =>
    Ok(Json.obj("users" -> Json.arr()))
  }

  def create: Action[AnyContent] = Action { implicit request =>
    Created(Json.obj("id" -> 1))
  }

  def get(id: Long): Action[AnyContent] = Action { implicit request =>
    Ok(Json.obj("id" -> id))
  }

  def delete(id: Long): Action[AnyContent] = Action { implicit request =>
    Ok(Json.obj("deleted" -> id))
  }
}