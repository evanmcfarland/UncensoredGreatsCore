import React from 'react';
import { useCardState } from '../../contexts/CardStateContext';
import AuthorCard from './AuthorCard';

const AuthorList = ({ authors }) => {
  return (
    <div>
      {authors.map((author) => {
        const { activeChat } = useCardState(author.id);
        return activeChat === null || activeChat === author.id ? (
          <AuthorCard author={author} key={author.id} />
        ) : null;
      })}
    </div>
  );
};

export default AuthorList;
