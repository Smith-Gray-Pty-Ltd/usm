package com.example;

import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.List;

@Path("/api/users")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserResource {

    @GET
    public List<String> list() {
        return List.of();
    }

    @POST
    public User create(User user) {
        return user;
    }

    @GET
    @Path("/{id}")
    public User get(@PathParam("id") Long id) {
        return new User(id, "user" + id);
    }

    @DELETE
    @Path("/{id}")
    public void delete(@PathParam("id") Long id) {
    }
}

class User {
    public Long id;
    public String name;
    public User(Long id, String name) { this.id = id; this.name = name; }
}