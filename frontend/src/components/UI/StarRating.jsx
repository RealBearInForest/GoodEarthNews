import React, { useState } from 'react';

export default function StarRating({ onRate, currentRating = 0 }) {
  const [hovered, setHovered] = useState(0);
  const [rated, setRated] = useState(currentRating);

  const handleRate = (star) => {
    setRated(star);
    onRate(star);
  };

  const displayed = hovered || rated;

  return (
    <div>
      <div className="star-rating">
        {[1, 2, 3, 4, 5].map(star => (
          <span
            key={star}
            className="star"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => handleRate(star)}
            style={{ filter: star <= displayed ? 'none' : 'grayscale(1) opacity(0.4)' }}
          >
            ⭐
          </span>
        ))}
      </div>
      {rated > 0 && (
        <div className="rating-label">
          {rated === 5 ? 'Amazing! 🌟' :
            rated === 4 ? 'Great story! 😊' :
            rated === 3 ? 'Good news 👍' :
            rated === 2 ? 'Interesting 🤔' : 'Thanks for rating'}
        </div>
      )}
    </div>
  );
}
