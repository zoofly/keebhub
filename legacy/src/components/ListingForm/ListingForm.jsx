import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  CircularProgress,
  InputAdornment,
  TextField,
} from '@material-ui/core';
import {
  LIMITS,
  isHttpUrl,
  toPostingPayload,
  validatePosting,
} from '../../utils/validation';
import './ListingForm.css';

const EMPTY = { title: '', description: '', image: '', price: '' };
const FIELD_ORDER = ['title', 'image', 'price', 'description'];

const toFormValues = (values = {}) => ({
  title: values.title || '',
  description: values.description || '',
  image: values.image || '',
  price: values.price === undefined || values.price === null ? '' : String(values.price),
});

// Shared create / edit form for market listings.
//   onSubmit(payload) must return a Promise. If it rejects with a message,
//   that message is shown at the top of the form.
function ListingForm({
  idPrefix = 'listing',
  initialValues = EMPTY,
  submitLabel = 'Save',
  submittingLabel = 'Saving…',
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(() => toFormValues(initialValues));
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const mounted = useRef(true);
  const errorRef = useRef(null);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (serverError && errorRef.current) {
      errorRef.current.focus();
    }
  }, [serverError]);

  const errors = validatePosting(values);
  const fieldError = (field) =>
    (attempted || touched[field]) && errors[field] ? errors[field] : '';

  const handleChange = (field) => (event) => {
    setValues({ ...values, [field]: event.target.value });
    if (field === 'image') {
      setPreviewFailed(false);
    }
  };

  const handleBlur = (field) => () => {
    setTouched({ ...touched, [field]: true });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttempted(true);
    setServerError('');

    const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
    if (firstInvalid) {
      const input = document.getElementById(`${idPrefix}-${firstInvalid}`);
      if (input) input.focus();
      return;
    }

    setSubmitting(true);
    onSubmit(toPostingPayload(values)).then(
      () => {
        if (mounted.current) setSubmitting(false);
      },
      (message) => {
        if (!mounted.current) return;
        setSubmitting(false);
        setServerError(
          typeof message === 'string'
            ? message
            : 'Something went wrong. Please try again.'
        );
      }
    );
  };

  const titleError = fieldError('title');
  const imageError = fieldError('image');
  const priceError = fieldError('price');
  const descriptionError = fieldError('description');
  const showPreview = isHttpUrl(values.image);

  return (
    <form className="listing-form form-stack" onSubmit={handleSubmit} noValidate>
      {serverError && (
        <div className="alert" role="alert" tabIndex={-1} ref={errorRef}>
          {serverError}
        </div>
      )}

      <TextField
        id={`${idPrefix}-title`}
        label="Title"
        required
        value={values.title}
        onChange={handleChange('title')}
        onBlur={handleBlur('title')}
        error={Boolean(titleError)}
        helperText={
          titleError || `${values.title.length}/${LIMITS.titleMax} characters`
        }
        inputProps={{ maxLength: LIMITS.titleMax }}
        placeholder="e.g. GMK Olivia++ base kit"
        autoComplete="off"
      />

      <TextField
        id={`${idPrefix}-image`}
        label="Photo URL"
        required
        type="url"
        value={values.image}
        onChange={handleChange('image')}
        onBlur={handleBlur('image')}
        error={Boolean(imageError)}
        helperText={
          imageError ||
          'Link to a photo of the item, starting with https:// (or http://)'
        }
        inputProps={{ inputMode: 'url' }}
        placeholder="https://"
        autoComplete="off"
      />

      {showPreview && (
        <div className="listing-form__preview">
          {previewFailed ? (
            <p className="listing-form__preview-note">
              We couldn't load an image from that link. Double-check that it
              points directly to a photo.
            </p>
          ) : (
            <img
              src={values.image.trim()}
              alt="Preview of your listing"
              onError={() => setPreviewFailed(true)}
            />
          )}
        </div>
      )}

      <TextField
        id={`${idPrefix}-price`}
        label="Price"
        required
        type="number"
        value={values.price}
        onChange={handleChange('price')}
        onBlur={handleBlur('price')}
        error={Boolean(priceError)}
        helperText={priceError || 'In US dollars. Use 0 for trades or giveaways.'}
        inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
        InputProps={{
          startAdornment: <InputAdornment position="start">$</InputAdornment>,
        }}
      />

      <TextField
        id={`${idPrefix}-description`}
        label="Description"
        multiline
        minRows={5}
        value={values.description}
        onChange={handleChange('description')}
        onBlur={handleBlur('description')}
        error={Boolean(descriptionError)}
        helperText={
          descriptionError ||
          `Optional. Condition, what's included, trade preferences. ${values.description.length}/${LIMITS.descriptionMax}`
        }
        inputProps={{ maxLength: LIMITS.descriptionMax }}
      />

      <div className="form-actions">
        {onCancel && (
          <Button
            variant="outlined"
            color="primary"
            size="large"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          disabled={submitting}
          startIcon={
            submitting ? (
              <CircularProgress size={18} color="inherit" aria-hidden="true" />
            ) : null
          }
        >
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default ListingForm;
