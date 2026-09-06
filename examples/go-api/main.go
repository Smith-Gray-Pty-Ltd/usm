package main

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func main() {
	r := gin.Default()

	r.GET("/api/users", getUsers)
	r.POST("/api/users", createUser)
	r.GET("/api/users/:id", getUser)
	r.DELETE("/api/users/:id", deleteUser)
	r.GET("/api/posts", getPosts)
	r.POST("/api/posts", createPost)

	r.Run(":8080")
}

func getUsers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"users": []string{}})
}

func createUser(c *gin.Context) {
	c.JSON(http.StatusCreated, gin.H{"id": 1})
}

func getUser(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func deleteUser(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"deleted": id})
}

func getPosts(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"posts": []string{}})
}

func createPost(c *gin.Context) {
	c.JSON(http.StatusCreated, gin.H{"id": 1})
}