package api

import (
	"time"

	"github.com/egeuysall/bridge/backend/internal/handlers"
	appmid "github.com/egeuysall/bridge/backend/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
)

// Router sets up the HTTP routes and middleware for the backend API.
//
// Returns a *chi.Mux router with all routes and middleware configured.
func Router() *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(
		middleware.Recoverer,
		middleware.RealIP,
		middleware.Timeout(3*time.Second),
		middleware.NoCache,
		middleware.Compress(5),
		httprate.LimitByIP(30, time.Minute),
		appmid.SetContentType(),
		appmid.Cors(),
	)

	// Public routes
	r.Get("/", handlers.HandleRoot)
	r.Get("/ping", handlers.HandlePing)

	r.Route("/v1", func(r chi.Router) {
		r.Post("/posts", handlers.HandleCreatePost)
		r.Get("/posts/{id}", handlers.HandleGetPost)
	})

	return r
}
