ThisBuild / version := "0.1.0"
ThisBuild / scalaVersion := "2.13.12"

lazy val root = (project in file("."))
  .settings(
    libraryDependencies ++= Seq(
      "com.softwaremill.sttp.tapir" %% "tapir-core" % "1.9.0",
      "com.softwaremill.sttp.tapir" %% "tapir-json-circe" % "1.9.0"
    )
  )