package handlers

import (
	"github.com/egeuysall/bridge/backend/internal/utils"
	"net/http"
)

func HandleRoot(w http.ResponseWriter, r *http.Request) {
	utils.SendJson(w, "Welcome to Bridge. Share your Markdown files quickly and easily. Upload a file or paste your Markdown and get a clean, shareable link instantly. No accounts needed, no clutter, just simple Markdown sharing.", http.StatusOK)
}

func HandlePing(w http.ResponseWriter, r *http.Request) {
	utils.SendJson(w, "Pong", http.StatusOK)
}
