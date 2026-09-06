ThisBuild / version := "0.1.0"
ThisBuild / scalaVersion := "2.13.12"

lazy val root = (project in file("."))
  .enablePlugins(PlayScala)
  .settings(
    libraryDependencies ++= Seq(
      guice,
      "org.playframework" %% "play" % "3.0.0"
    )
  )