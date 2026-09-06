require 'sinatra'
require 'json'

get '/api/users' do
  content_type :json
  { users: [] }.to_json
end

post '/api/users' do
  content_type :json
  status 201
  { id: 1 }.to_json
end

get '/api/users/:id' do
  content_type :json
  { id: params[:id] }.to_json
end

delete '/api/users/:id' do
  content_type :json
  { deleted: params[:id] }.to_json
end

get '/api/products' do
  content_type :json
  { products: [] }.to_json
end