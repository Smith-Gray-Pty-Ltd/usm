cmake_minimum_required(VERSION 3.20)
project(cpp-crow VERSION 0.1.0)

find_package(Crow REQUIRED)

add_executable(cpp-crow src/main.cpp)
target_link_libraries(cpp-crow Crow::Crow)