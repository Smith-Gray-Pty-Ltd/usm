package com.example

import org.springframework.web.bind.annotation.*
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class UserController {

    @GetMapping("/users")
    fun getUsers(): List<String> = emptyList()

    @PostMapping("/users")
    fun createUser(@RequestBody user: Map<String, Any>): Map<String, Any> = mapOf("id" to 1)

    @GetMapping("/users/{id}")
    fun getUser(@PathVariable id: Long): Map<String, Any> = mapOf("id" to id)

    @DeleteMapping("/users/{id}")
    fun deleteUser(@PathVariable id: Long): Map<String, Any> = mapOf("deleted" to id)
}