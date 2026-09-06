cmake_minimum_required(VERSION 3.20)
project(cpp-drogon VERSION 0.1.0)

find_package(Drogon REQUIRED)

add_executable(cpp-drogon src/main.cpp)
target_link_libraries(cpp-drogon Drogon::Drogon)