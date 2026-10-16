package main

import (
	"encoding/json"
	"log"
	"net/http"

	"example.com/notes/internal/store"
)

func main() {
	s := store.New()
	http.HandleFunc("/notes", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(s.All())
		case http.MethodPost:
			var n store.Note
			if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
				http.Error(w, "bad note", http.StatusBadRequest)
				return
			}
			s.Add(n)
			w.WriteHeader(http.StatusCreated)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	log.Fatal(http.ListenAndServe(":8080", nil))
}
