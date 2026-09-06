package main

import (
	"github.com/labstack/echo/v4"
	"net/http"
)

func main() {
	e := echo.New()

	e.GET("/api/users", getUsers)
	e.POST("/api/users", createUser)
	e.GET("/api/users/:id", getUser)
	e.DELETE("/api/users/:id", deleteUser)
	e.GET("/api/products", getProducts)

	e.Start(":8080")
}

func getUsers(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{"users": []string{}})
}

func createUser(c echo.Context) error {
	return c.JSON(http.StatusCreated, map[string]interface{}{"id": 1})
}

func getUser(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{"id": c.Param("id")})
}

func deleteUser(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{"deleted": c.Param("id")})
}

func getProducts(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]interface{}{"products": []string{}})
}