import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  useMediaQuery,
} from '@material-ui/core';
import { useTheme } from '@material-ui/core/styles';
import swal from 'sweetalert';
import ListingCard from '../ListingCard/ListingCard';
import ListingForm from '../ListingForm/ListingForm';

// Grid of listing cards. Edit / Delete controls only appear on listings
// owned by the logged-in user (the server also enforces this).
function ListingsGrid({ listings, currentUserId, headingLevel = 'h2' }) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('xs'));
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const isOwner = (post) =>
    currentUserId != null && post.user_id === currentUserId;

  // Wrap a saga action in a Promise so the UI can wait for the real result
  const dispatchWithResult = (action) =>
    new Promise((resolve, reject) => dispatch({ ...action, resolve, reject }));

  const handleDelete = (post) => {
    swal({
      title: 'Delete this listing?',
      text: `"${post.title}" will be removed from the market. This can't be undone.`,
      icon: 'warning',
      buttons: ['Keep it', 'Delete'],
      dangerMode: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      setDeletingId(post.id);
      dispatchWithResult({ type: 'DELETE_POST', payload: post.id })
        .then(
          () =>
            swal({
              title: 'Listing deleted',
              icon: 'success',
              button: 'Okay',
            }),
          (message) =>
            swal({
              title: "Couldn't delete listing",
              text: message,
              icon: 'error',
              button: 'Okay',
            })
        )
        .finally(() => setDeletingId(null));
    });
  };

  const handleSave = (payload) =>
    dispatchWithResult({
      type: 'EDIT_ITEM',
      payload: { ...payload, id: editing.id },
    }).then(() => {
      setEditing(null);
      swal({
        title: 'Listing updated',
        icon: 'success',
        button: 'Okay',
      });
    });

  return (
    <>
      <ul className="card-grid">
        {listings.map((post) => (
          <li key={post.id}>
            <ListingCard
              post={post}
              headingLevel={headingLevel}
              canManage={isOwner(post)}
              busy={deletingId === post.id}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          </li>
        ))}
      </ul>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        aria-labelledby="edit-listing-dialog-title"
        fullWidth
        maxWidth="sm"
        fullScreen={fullScreenDialog}
      >
        <DialogTitle id="edit-listing-dialog-title" disableTypography>
          <h2 className="dialog-title">Edit listing</h2>
        </DialogTitle>
        <DialogContent>
          {editing && (
            <ListingForm
              key={editing.id}
              idPrefix="edit-listing"
              initialValues={editing}
              submitLabel="Save changes"
              submittingLabel="Saving…"
              onSubmit={handleSave}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ListingsGrid;
