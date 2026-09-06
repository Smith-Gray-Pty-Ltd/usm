Rails.application.routes.draw do
  namespace :api do
    resources :users
    resources :products
  end
end