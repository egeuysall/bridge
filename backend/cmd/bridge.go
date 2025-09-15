package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	filePath := flag.String("p", "", "Path to Markdown file")
	flag.Parse()

	if *filePath == "" {
		fmt.Println("Please provide a file path using -p flag")
		os.Exit(1)
	}

	// Read the Markdown file
	mdData, err := os.ReadFile(*filePath)
	if err != nil {
		fmt.Println("Error reading file:", err)
		os.Exit(1)
	}

	// Wrap it in a JSON payload
	payload := []byte(fmt.Sprintf(`{"content": %q}`, string(mdData)))

	req, err := http.NewRequest("POST", "http://localhost:8080/v1/posts", bytes.NewBuffer(payload))
	if err != nil {
		fmt.Println("Error creating request:", err)
		os.Exit(1)
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("Error reading response:", err)
		os.Exit(1)
	}

	// Accept 200 and 201 as success
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		fmt.Printf("Server returned status %d: %s\n", resp.StatusCode, string(body))
		os.Exit(1)
	}

	// Parse the ID from the response
	type RespData struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	var result RespData
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Println("Error parsing response JSON:", err)
		os.Exit(1)
	}

	fmt.Printf("Your note is published at http://localhost:3000/%s\n", result.Data.ID)
}
