package store

import "testing"

func TestAddAssignsIDs(t *testing.T) {
	s := New()
	if got := s.Add(Note{Text: "a"}).ID; got != 1 {
		t.Fatalf("first ID = %d, want 1", got)
	}
	if got := s.Add(Note{Text: "b"}).ID; got != 2 {
		t.Fatalf("second ID = %d, want 2", got)
	}
}
