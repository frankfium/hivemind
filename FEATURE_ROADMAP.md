# Hivemind Feature Roadmap

## Planned Features

### 1. Partial Text Recognition (High Priority)
**Status**: Planned for v1.1

**Description**: Implement fuzzy matching for trending messages to catch variations and partial matches.

**Technical Approach**:
- Use string similarity algorithms (Levenshtein distance, Jaro-Winkler)
- Calculate similarity percentage between messages
- Group similar messages under a "canonical" version
- Increment count when similarity threshold is met

**Implementation Details**:
```javascript
// Example similarity calculation
function calculateSimilarity(str1, str2) {
  // Use Levenshtein distance or similar algorithm
  // Return percentage (0-100) of similarity
}

// Group similar messages
function findSimilarMessage(newMessage, existingMessages) {
  for (const [canonical, data] of messageGroups) {
    if (calculateSimilarity(newMessage, canonical) > SIMILARITY_THRESHOLD) {
      return canonical;
    }
  }
  return null; // No similar message found
}
```

**Settings to Add**:
- **Similarity Threshold** (70-95%): How similar messages need to be
- **Minimum Length** (3-10 chars): Minimum message length for fuzzy matching
- **Enable Fuzzy Matching**: Toggle for the feature

**Use Cases**:
- "PogChamp" vs "pogchamp" vs "POGCHAMP"
- "LUL" vs "lul" vs "LULW"
- "monkaS" vs "monkas" vs "monkaS"
- Typos and variations of popular messages
- Different capitalization of the same message

**Benefits**:
- More accurate trending detection
- Catches message variations
- Reduces fragmentation of similar messages
- Better user experience with consolidated trending

---

## Future Enhancements

### 2. Message Categories
- Separate trending by message type (emotes, text, commands)
- Different thresholds for different categories

### 3. Time-based Trending
- Trending messages from last 5 minutes vs last hour
- Different time windows for different types of content

### 4. User-based Trending
- Trending messages from specific users
- VIP/Mod message highlighting

### 5. Emote-specific Trending
- Track trending emotes separately
- Show emote usage counts

### 6. Advanced Filtering
- Filter out common words ("the", "and", etc.)
- Blacklist certain messages
- Whitelist important messages

---

## Implementation Notes

### Similarity Algorithms to Consider:
1. **Levenshtein Distance**: Good for typos and small changes
2. **Jaro-Winkler**: Better for longer strings with transpositions
3. **Cosine Similarity**: Good for word-based similarity
4. **Jaccard Index**: Good for set-based similarity

### Performance Considerations:
- Cache similarity calculations
- Limit comparison to recent messages
- Use efficient data structures for lookups
- Consider message length for optimization

### User Experience:
- Show similarity percentage in settings
- Allow users to see grouped messages
- Provide examples of what would be grouped
- Make it configurable per user preference
