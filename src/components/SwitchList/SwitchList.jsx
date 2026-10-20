import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card } from '@material-ui/core';
import StatusMessage from '../StatusMessage/StatusMessage';
import { isHttpUrl } from '../../utils/validation';
import './SwitchList.css';

function SwitchCard({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const titleId = `switch-${item.id}-title`;
  const details = [
    ['Type', item.switch_type],
    ['Actuation', item.actuation_point],
    ['Mount', item.switch_mount],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <Card component="article" className="switch-card" aria-labelledby={titleId}>
      <div className="switch-card__media">
        {isHttpUrl(item.image) && !imageFailed ? (
          <img
            src={item.image}
            alt={`${item.switch_name} switch`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="switch-card__placeholder" role="img" aria-label="No photo available">
            No photo
          </div>
        )}
      </div>
      <div className="switch-card__body">
        <h3 id={titleId} className="switch-card__title">
          {item.switch_name}
        </h3>
        {details.length > 0 && (
          <dl className="switch-card__details">
            {details.map(([label, value]) => (
              <div key={label} className="switch-card__detail">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {item.description && (
          <p className="switch-card__description">{item.description}</p>
        )}
      </div>
    </Card>
  );
}

function SwitchList() {
  const dispatch = useDispatch();
  const switchesList = useSelector((store) => store.switches);
  const status = useSelector((store) => store.status.switches);

  useEffect(() => {
    dispatch({ type: 'GET_SWITCHES' });
  }, [dispatch]);

  let content;
  if (status.loading && switchesList.length === 0) {
    content = <StatusMessage variant="loading">Loading switches…</StatusMessage>;
  } else if (status.error && switchesList.length === 0) {
    content = (
      <StatusMessage
        variant="error"
        title="Switches didn't load"
        onRetry={() => dispatch({ type: 'GET_SWITCHES' })}
      >
        {status.error}
      </StatusMessage>
    );
  } else if (switchesList.length === 0) {
    content = (
      <StatusMessage title="No switches yet">
        Check back soon for a guide to popular switches.
      </StatusMessage>
    );
  } else {
    content = (
      <ul className="card-grid">
        {switchesList.map((item) => (
          <li key={item.id}>
            <SwitchCard item={item} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="section" aria-labelledby="switches-heading">
      <h2 id="switches-heading">Switch guide</h2>
      <p className="page-lede switch-list__lede">
        A quick reference for popular mechanical keyboard switches.
      </p>
      {content}
    </section>
  );
}

export default SwitchList;
