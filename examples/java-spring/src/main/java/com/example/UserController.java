package com.example;

import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
public class UserController {

    @GetMapping("/users")
    public List<String> getUsers() {
        return List.of();
    }

    @PostMapping("/users")
    public User createUser(@RequestBody User user) {
        return user;
    }

    @GetMapping("/users/{id}")
    public User getUser(@PathVariable Long id) {
        return new User(id, "user" + id);
    }

    @DeleteMapping("/users/{id}")
    public void deleteUser(@PathVariable Long id) {
    }

    @PutMapping("/users/{id}")
    public User updateUser(@PathVariable Long id, @RequestBody User user) {
        return user;
    }
}

class User {
    private Long id;
    private String name;
    public User(Long id, String name) { this.id = id; this.name = name; }
    public Long getId() { return id; }
    public String getName() { return name; }
}