import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Route

val userRoutes: Route =
  pathPrefix("api") {
    path("users") {
      get { complete("""{"users":[]}""") } ~
      post { complete("""{"id":1}""") }
    } ~
    path("users" / Segment) { id =>
      get { complete(s"""{"id":"$id"}""") } ~
      delete { complete(s"""{"deleted":"$id"}""") }
    } ~
    path("products") {
      get { complete("""{"products":[]}""") }
    }
  }