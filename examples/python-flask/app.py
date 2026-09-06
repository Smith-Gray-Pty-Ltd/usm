from flask import Flask, jsonify, request

app = Flask(__name__)


@app.route("/api/users", methods=["GET"])
def get_users():
    return jsonify({"users": []})


@app.route("/api/users", methods=["POST"])
def create_user():
    return jsonify({"id": 1}), 201


@app.route("/api/users/<user_id>", methods=["GET"])
def get_user(user_id):
    return jsonify({"id": user_id})


@app.route("/api/users/<user_id>", methods=["DELETE"])
def delete_user(user_id):
    return jsonify({"deleted": user_id})


@app.route("/api/products", methods=["GET"])
def get_products():
    return jsonify({"products": []})