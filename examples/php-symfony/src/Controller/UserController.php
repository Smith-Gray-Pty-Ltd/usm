<?php

namespace App\Controller;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

class UserController
{
    #[Route('/api/users', methods: ['GET'])]
    public function index(): JsonResponse
    {
        return new JsonResponse(['users' => []]);
    }

    #[Route('/api/users', methods: ['POST'])]
    public function create(): JsonResponse
    {
        return new JsonResponse(['id' => 1], 201);
    }

    #[Route('/api/users/{id}', methods: ['GET'])]
    public function show(int $id): JsonResponse
    {
        return new JsonResponse(['id' => $id]);
    }

    #[Route('/api/users/{id}', methods: ['DELETE'])]
    public function delete(int $id): JsonResponse
    {
        return new JsonResponse(['deleted' => $id]);
    }
}