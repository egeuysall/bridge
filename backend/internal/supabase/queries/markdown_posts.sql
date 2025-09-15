-- name: CreatePost :one
INSERT INTO markdown_posts (content)
VALUES ($1)
    RETURNING id;

-- name: GetPostByID :one
SELECT id, content, created_at
FROM markdown_posts
WHERE id = $1;
