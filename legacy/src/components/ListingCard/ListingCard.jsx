import React, { useState } from 'react';
import { Button, Card } from '@material-ui/core';
import { formatPrice, isHttpUrl } from '../../utils/validation';
import './ListingCard.css';

// Long descriptions are collapsed behind a "Show more" toggle
const LONG_DESCRIPTION = 220;

function ListingCard({
  post,
  headingLevel: Heading = 'h2',
  canManage = false,
  busy = false,
  onEdit,
  onDelete,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const titleId = `listing-${post.id}-title`;
  const descriptionId = `listing-${post.id}-description`;
  const description = post.description || '';
  const isLong = description.length > LONG_DESCRIPTION;
  // Only render image links that are plain http(s) URLs
  const showImage = isHttpUrl(post.image) && !imageFailed;

  return (
    <Card component="article" className="listing-card" aria-labelledby={titleId}>
      <div className="listing-card__media">
        {showImage ? (
          <img
            src={post.image}
            alt={post.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="listing-card__placeholder" role="img" aria-label="No photo available">
            No photo
          </div>
        )}
      </div>

      <div className="listing-card__body">
        <Heading id={titleId} className="listing-card__title">
          {post.title}
        </Heading>
        <p className="listing-card__price">
          {Number(post.price) === 0 ? 'Free / trade' : formatPrice(post.price)}
        </p>
        {description && (
          <p
            id={descriptionId}
            className={`listing-card__description ${
              isLong && !expanded ? 'listing-card__description_clamped' : ''
            }`}
          >
            {description}
          </p>
        )}
        {isLong && (
          <button
            type="button"
            className="listing-card__more"
            aria-expanded={expanded}
            aria-controls={descriptionId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {canManage && (
        <div className="listing-card__actions">
          <Button
            variant="outlined"
            color="primary"
            onClick={() => onEdit(post)}
            disabled={busy}
          >
            Edit<span className="visually-hidden"> {post.title}</span>
          </Button>
          <Button
            variant="outlined"
            className="btn-danger"
            onClick={() => onDelete(post)}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete'}
            <span className="visually-hidden"> {post.title}</span>
          </Button>
        </div>
      )}
    </Card>
  );
}

export default ListingCard;
