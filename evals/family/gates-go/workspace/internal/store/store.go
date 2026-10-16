package store

import "sync"

// Note is one saved note.
type Note struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

// Store keeps notes in memory.
type Store struct {
	mu    sync.Mutex
	notes []Note
}

// New returns an empty store.
func New() *Store { return &Store{} }

// Add saves a note and gives it the next ID.
func (s *Store) Add(n Note) Note {
	s.mu.Lock()
	defer s.mu.Unlock()
	n.ID = len(s.notes) + 1
	s.notes = append(s.notes, n)
	return n
}

// All returns a copy of every note.
func (s *Store) All() []Note {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Note(nil), s.notes...)
}
