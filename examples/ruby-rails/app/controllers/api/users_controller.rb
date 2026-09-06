module Api
  class UsersController < ApplicationController
    def index
      render json: { users: [] }
    end

    def show
      render json: { id: params[:id] }
    end

    def create
      render json: { id: 1 }, status: :created
    end

    def update
      render json: { id: params[:id], updated: true }
    end

    def destroy
      render json: { deleted: params[:id] }
    end
  end
end