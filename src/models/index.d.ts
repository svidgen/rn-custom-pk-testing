import { ModelInit, MutableModel } from "@aws-amplify/datastore";

type BasicModelMetaData = {
  readOnlyFields: 'createdAt' | 'updatedAt';
}

type PostMetaData = {
  readOnlyFields: 'createdAt' | 'updatedAt';
}

type CommentMetaData = {
  readOnlyFields: 'createdAt' | 'updatedAt';
}

export declare class BasicModel {
  readonly id: string;
  readonly body: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  constructor(init: ModelInit<BasicModel, BasicModelMetaData>);
  static copyOf(source: BasicModel, mutator: (draft: MutableModel<BasicModel, BasicModelMetaData>) => MutableModel<BasicModel, BasicModelMetaData> | void): BasicModel;
}

export declare class Post {
  readonly id: string;
  readonly postId: string;
  readonly title: string;
  readonly comments?: (Comment | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  constructor(init: ModelInit<Post, PostMetaData>);
  static copyOf(source: Post, mutator: (draft: MutableModel<Post, PostMetaData>) => MutableModel<Post, PostMetaData> | void): Post;
}

export declare class Comment {
  readonly id: string;
  readonly commentId: string;
  readonly content: string;
  readonly post?: Post | null;
  readonly postTitle?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  constructor(init: ModelInit<Comment, CommentMetaData>);
  static copyOf(source: Comment, mutator: (draft: MutableModel<Comment, CommentMetaData>) => MutableModel<Comment, CommentMetaData> | void): Comment;
}