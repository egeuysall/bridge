package handlers

import (
	"encoding/json"
	"github.com/egeuysall/bridge/backend/internal/models"
	"github.com/egeuysall/bridge/backend/internal/utils"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
)

func HandleGetPost(w http.ResponseWriter, r *http.Request) {
	postIDStr := chi.URLParam(r, "id")
	if postIDStr == "" {
		utils.SendError(w, "Missing postId parameter", http.StatusBadRequest)
		return
	}

	var postID pgtype.UUID
	if err := postID.Scan(postIDStr); err != nil {
		utils.SendError(w, "Invalid post ID", http.StatusBadRequest)
		return
	}

	post, err := utils.Queries.GetPostByID(r.Context(), postID)
	if err != nil {
		if err == pgx.ErrNoRows {
			utils.SendError(w, "Post not found", http.StatusNotFound)
			return
		}
		utils.SendError(w, "Failed to get post", http.StatusInternalServerError)
		return
	}

	resp := models.Post{
		ID:        post.ID.String(),
		Content:   post.Content,
		CreatedAt: post.CreatedAt.Time,
	}

	utils.SendJson(w, resp, http.StatusOK)
}

// HandleCreatePost creates a new post
func HandleCreatePost(w http.ResponseWriter, r *http.Request) {
	var req models.Post
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		utils.SendError(w, "Title and content cannot be empty", http.StatusBadRequest)
		return
	}

	newPost, err := utils.Queries.CreatePost(r.Context(), req.Content)
	if err != nil {
		utils.SendError(w, "Failed to create post", http.StatusInternalServerError)
		return
	}

	postContent := newPost.String

	resp := map[string]string{
		"id": postContent(),
	}

	utils.SendJson(w, resp, http.StatusCreated)
}
