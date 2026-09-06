package handlers

import (
	"github.com/gin-gonic/gin"
	"net/http"
)

func RegisterUserRoutes(r *gin.Engine) {
	r.GET("/api/users/:id/profile", getProfile)
	r.PUT("/api/users/:id/profile", updateProfile)
}

func getProfile(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"profile": "data"})
}

func updateProfile(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"updated": true})
}