import sttp.tapir._
import sttp.tapir.json.circe._
import io.circe.generic.auto._

case class User(id: Long, name: String)

val listUsersEndpoint: PublicEndpoint[Unit, Unit, List[User], Any] =
  endpoint.get.in("api" / "users").out(jsonBody[List[User]])

val createUserEndpoint: PublicEndpoint[User, Unit, User, Any] =
  endpoint.post.in("api" / "users").in(jsonBody[User]).out(jsonBody[User])

val getUserEndpoint: PublicEndpoint[Long, Unit, User, Any] =
  endpoint.get.in("api" / "users" / path[Long]).out(jsonBody[User])

val deleteUserEndpoint: PublicEndpoint[Long, Unit, Unit, Any] =
  endpoint.delete.in("api" / "users" / path[Long])

val listProductsEndpoint: PublicEndpoint[Unit, Unit, List[String], Any] =
  endpoint.get.in("api" / "products").out(jsonBody[List[String]])