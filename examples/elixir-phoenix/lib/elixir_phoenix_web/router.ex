defmodule ElixirPhoenixWeb.Router do
  use Phoenix.Router

  scope "/api", ElixirPhoenixWeb do
    get "/users", UserController, :index
    post "/users", UserController, :create
    get "/users/:id", UserController, :show
    delete "/users/:id", UserController, :destroy
    put "/users/:id", UserController, :update
  end
end