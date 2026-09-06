package main

import (
	"net/http"
	"github.com/go-chi/chi/v5"
)

func main() {
	r := chi.NewRouter()

	r.Get("/api/users", getUsers)
	r.Post("/api/users", createUser)
	r.Get("/api/users/{id}", getUser)
	r.Delete("/api/users/{id}", deleteUser)
	r.Get("/api/products", getProducts)

	http.ListenAndServe(":8080", r)
}

func getUsers(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte(`{"users":[]}`))
}

func createUser(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(201)
	w.Write([]byte(`{"id":1}`))
}

func getUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	w.Write([]byte(`{"id":"` + id + `"}`))
}

func deleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	w.Write([]byte(`{"deleted":"` + id + `"}`))
}

func getProducts(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte(`{"products":[]}`))
}