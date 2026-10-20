import React from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { Card } from '@material-ui/core';
import swal from 'sweetalert';
import ListingForm from '../ListingForm/ListingForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import './PostingForm.css';

function PostingForm() {
  useDocumentTitle('Create a listing');
  const dispatch = useDispatch();
  const history = useHistory();

  // Resolves only after the server accepts the listing, so the success
  // message reflects what actually happened. Rejections are shown in the form.
  const handleSubmit = (payload) =>
    new Promise((resolve, reject) =>
      dispatch({ type: 'ADD_POST', payload, resolve, reject })
    ).then(() => {
      history.push('/market');
      swal({
        title: 'Listing posted!',
        text: 'Your listing is now live on the market.',
        icon: 'success',
        button: 'Okay',
      });
    });

  const handleCancel = () => {
    history.push('/market');
  };

  return (
    <div className="page page_narrow">
      <div className="page-header">
        <div>
          <h1>Create a listing</h1>
          <p className="page-lede">
            Fields marked with * are required.
          </p>
        </div>
      </div>
      <Card className="posting-form-card">
        <ListingForm
          idPrefix="new-listing"
          submitLabel="Post listing"
          submittingLabel="Posting…"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </Card>
    </div>
  );
}

export default PostingForm;
