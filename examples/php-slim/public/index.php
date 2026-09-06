<?php

use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

$app->get('/api/users', function ($request, $response) {
    $response->getBody()->write(json_encode(['users' => []]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->post('/api/users', function ($request, $response) {
    $response->getBody()->write(json_encode(['id' => 1]));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
});

$app->get('/api/users/{id}', function ($request, $response, $args) {
    $response->getBody()->write(json_encode(['id' => $args['id']]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->delete('/api/users/{id}', function ($request, $response, $args) {
    $response->getBody()->write(json_encode(['deleted' => $args['id']]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->get('/api/products', function ($request, $response) {
    $response->getBody()->write(json_encode(['products' => []]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();